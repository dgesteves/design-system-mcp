import path from 'node:path';

import { Catalog, type ProjectSet, type ServedProject } from '../catalog.js';
import { DesignSystemHost, type DesignSystem } from '../design-system.js';
import type { Logger } from '../util/log.js';
import { isInside } from '../util/paths.js';
import type { Project, Workspace } from '../workspace.js';

export interface WorkspaceProjectsOptions {
  cache: boolean;
  watch: boolean;
  logger: Logger;
  /** Called when a project's design system reloads. */
  onChange?: () => void;
}

/**
 * A workspace root's projects for the MCP server: one `DesignSystemHost` per project,
 * created on first use and watched from then on, and the merged catalog, rebuilt when a
 * project reloads.
 */
export class WorkspaceProjects implements ProjectSet {
  private readonly hosts = new Map<string, DesignSystemHost>();
  private merged?: { from: DesignSystem[]; catalog: Catalog };

  constructor(
    readonly workspace: Workspace,
    private readonly options: WorkspaceProjectsOptions,
  ) {}

  get root(): string {
    return this.workspace.root;
  }

  get dirs(): string[] {
    return this.workspace.projects.map((p) => p.dir);
  }

  async forPath(target: string): Promise<ServedProject> {
    const absolute = path.resolve(this.root, target);
    if (!isInside(this.root, absolute)) {
      throw new Error(`${target} is outside the workspace root (${this.root}).`);
    }
    const project = await this.workspace.projectFor(absolute);
    return { ds: await this.host(project).get(), dir: project.dir, name: project.name };
  }

  async all(): Promise<ServedProject[]> {
    const served: ServedProject[] = [];
    for (const project of this.workspace.projects) {
      served.push({ ds: await this.host(project).get(), dir: project.dir, name: project.name });
    }
    return served;
  }

  async catalog(): Promise<Catalog> {
    const all = await this.all();
    const from = all.map((p) => p.ds);
    if (
      this.merged?.from.length !== from.length ||
      this.merged.from.some((ds, i) => ds !== from[i])
    ) {
      this.merged = { from, catalog: new Catalog(this.root, all) };
    }
    return this.merged.catalog;
  }

  close(): void {
    for (const host of this.hosts.values()) host.close();
    this.hosts.clear();
  }

  private host(project: Project): DesignSystemHost {
    let host = this.hosts.get(project.root);
    if (host) return host;
    host = new DesignSystemHost(project.config, {
      cache: this.options.cache,
      logger: this.options.logger,
      loadConfig: () => this.workspace.configFor(project),
    });
    host.onChange(() => this.options.onChange?.());
    if (this.options.watch) host.watch();
    this.hosts.set(project.root, host);
    return host;
  }
}
