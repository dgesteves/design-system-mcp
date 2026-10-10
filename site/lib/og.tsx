import fs from 'node:fs/promises';
import path from 'node:path';

import type { ReactNode } from 'react';

import { bench, demo } from '@/lib/data';

/**
 * Open Graph images, drawn with next/og from the same generated data as the pages: the
 * findings on the home card are what check_ui returned for the demo draft at build time.
 */

export const C = {
  ink: '#0d0f12',
  raised: '#14181d',
  raised2: '#181c22',
  line: '#262b33',
  lineStrong: '#353c47',
  fg: '#f5f7fa',
  fgSoft: '#dfe6ee',
  muted: '#9aa6b4',
  subtle: '#808b99',
  cyan: '#22d3ee',
  cyanBright: '#67e8f9',
  magenta: '#f0468a',
  magentaSoft: '#ff7eb0',
};

const FONT_DIR = path.join(process.cwd(), 'node_modules/geist/dist/fonts');

async function font(file: string): Promise<ArrayBuffer> {
  const buffer = await fs.readFile(path.join(FONT_DIR, file));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/** Geist and Geist Mono as TrueType, which the renderer reads (it does not read woff2). */
export async function ogFonts() {
  const [regular, medium, semibold, mono, monoMedium] = await Promise.all([
    font('geist-sans/Geist-Regular.ttf'),
    font('geist-sans/Geist-Medium.ttf'),
    font('geist-sans/Geist-SemiBold.ttf'),
    font('geist-mono/GeistMono-Regular.ttf'),
    font('geist-mono/GeistMono-Medium.ttf'),
  ]);
  return [
    { name: 'Geist', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Geist', data: medium, weight: 500 as const, style: 'normal' as const },
    { name: 'Geist', data: semibold, weight: 600 as const, style: 'normal' as const },
    { name: 'Geist Mono', data: mono, weight: 400 as const, style: 'normal' as const },
    { name: 'Geist Mono', data: monoMedium, weight: 500 as const, style: 'normal' as const },
  ];
}

function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112" fill="#11161b" />
      <rect x="105" y="105" width="136" height="136" rx="32" fill={C.cyan} />
      <rect
        x="277"
        y="111"
        width="124"
        height="124"
        rx="26"
        fill={C.raised}
        stroke={C.lineStrong}
        strokeWidth="12"
      />
      <rect
        x="111"
        y="277"
        width="124"
        height="124"
        rx="26"
        fill={C.raised}
        stroke={C.lineStrong}
        strokeWidth="12"
      />
      <rect
        x="271"
        y="271"
        width="136"
        height="136"
        rx="32"
        fill={C.raised}
        stroke={C.cyan}
        strokeWidth="12"
      />
      <path
        d="M 305 341 L 329 365 L 375 317"
        fill="none"
        stroke={C.cyan}
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ size = 16, color = C.cyan }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The shared frame: ink, a soft cyan glow, a faint grid, and the wordmark. */
export function Frame({
  width,
  height,
  footer,
  children,
}: {
  width: number;
  height: number;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: C.ink,
        backgroundImage:
          'radial-gradient(900px 480px at 12% -10%, rgba(34,211,238,0.16), rgba(34,211,238,0) 70%), radial-gradient(700px 420px at 100% 100%, rgba(240,70,138,0.07), rgba(240,70,138,0) 70%)',
        color: C.fg,
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '44px 64px 0' }}>
        <Logo size={40} />
        <span style={{ fontFamily: 'Geist Mono', fontSize: 24, fontWeight: 500, color: C.fg }}>
          onsystem
        </span>
      </div>
      <div style={{ display: 'flex', flex: 1, padding: '0 64px' }}>{children}</div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 64px 40px',
          fontFamily: 'Geist Mono',
          fontSize: 20,
          color: C.subtle,
        }}
      >
        <span>{footer}</span>
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'Geist Mono',
        fontSize: 20,
        letterSpacing: 3,
        color: C.cyan,
        textTransform: 'uppercase',
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.cyan }} />
      {children}
    </div>
  );
}

/** The loop as a terminal: the draft, check_ui's findings with their fixes, then clean. */
export function SessionPanel({ width }: { width: number }) {
  const mono = { fontFamily: 'Geist Mono', fontSize: 15 };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width,
        borderRadius: 16,
        border: `1px solid ${C.line}`,
        backgroundColor: 'rgba(20,24,29,0.92)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 18px',
          borderBottom: `1px solid ${C.line}`,
          backgroundColor: '#11151a',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.lineStrong }}
          />
        ))}
        <span style={{ ...mono, fontSize: 13, color: C.subtle, marginLeft: 12 }}>
          ~/acme-app · agent session
        </span>
      </div>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px', ...mono }}
      >
        <div style={{ display: 'flex', gap: 10, color: C.fg }}>
          <span style={{ color: C.cyan }}>›</span>
          <span>{demo.prompt}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, color: C.muted }}>
          <span>Write</span>
          <span style={{ color: C.fgSoft }}>{demo.file}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: C.cyanBright }}>onsystem · check_ui</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            backgroundColor: C.raised2,
            padding: '10px 14px',
            gap: 5,
            fontSize: 13.5,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <span style={{ color: C.magentaSoft }}>{demo.errorCount} errors</span>
            <span style={{ color: C.subtle }}>·</span>
            <span style={{ color: C.cyan }}>{demo.warningCount} warnings</span>
            <span style={{ color: C.subtle }}>each with a fix</span>
          </div>
          {demo.findings.map((f, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: f.severity === 'error' ? C.magenta : C.cyan,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: C.fgSoft }}>{f.found}</span>
              <span style={{ color: C.subtle }}>→</span>
              <span style={{ color: C.cyanBright }}>{f.fix}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.cyanBright }}>check_ui</span>
          <Check size={18} />
          <span style={{ color: C.fgSoft }}>No design-system problems</span>
        </div>
      </div>
    </div>
  );
}

/** The home card, also the GitHub social preview: the claim, the benchmark and the loop. */
export function HomeCard({
  width,
  height,
  footer,
}: {
  width: number;
  height: number;
  footer: string;
}) {
  const [model] = bench.models;
  return (
    <Frame width={width} height={height} footer={footer}>
      <div style={{ display: 'flex', width: '100%', gap: 48, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 22 }}>
          <Eyebrow>Claude Code hook · CI check · MCP</Eyebrow>
          <div
            style={{
              display: 'flex',
              fontSize: 46,
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: -1.2,
            }}
          >
            Keeps coding agents on your design system.
          </div>
          {model && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
              <span
                style={{
                  fontSize: 84,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: C.cyan,
                  letterSpacing: -2,
                }}
              >
                {model.plugin.clean}/{model.plugin.runs}
              </span>
              <span style={{ marginTop: 14, fontSize: 22, color: C.fgSoft }}>
                clean components with the plugin
              </span>
              <span style={{ marginTop: 4, fontSize: 22, color: C.muted }}>
                {model.base.clean}/{model.base.runs} without ({model.name.replace('Claude ', '')},
                vercel/ai-chatbot)
              </span>
            </div>
          )}
        </div>
        <SessionPanel width={Math.round(width * 0.43)} />
      </div>
    </Frame>
  );
}

/** A page card: what the page is, in a sentence, with real detail on the right. */
export function PageCard({
  width,
  height,
  eyebrow,
  title,
  lead,
  aside,
}: {
  width: number;
  height: number;
  eyebrow: string;
  title: string;
  lead: string;
  aside: ReactNode;
}) {
  return (
    <Frame width={width} height={height} footer="design-system-mcp-demo.vercel.app">
      <div style={{ display: 'flex', width: '100%', gap: 48, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 22 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <div
            style={{
              display: 'flex',
              fontSize: 52,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: -1.4,
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex', fontSize: 24, lineHeight: 1.4, color: C.muted }}>
            {lead}
          </div>
        </div>
        <div style={{ display: 'flex', width: Math.round(width * 0.4) }}>{aside}</div>
      </div>
    </Frame>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        gap: 10,
        borderRadius: 16,
        border: `1px solid ${C.line}`,
        backgroundColor: 'rgba(20,24,29,0.92)',
        padding: '20px 22px',
        fontFamily: 'Geist Mono',
        fontSize: 17,
      }}
    >
      {children}
    </div>
  );
}

export function Dot({ error }: { error: boolean }) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: error ? C.magenta : C.cyan,
        flexShrink: 0,
      }}
    />
  );
}
