// What /rules says about each rule beyond its source and the README: why it matters, and an
// example. scripts/generate.mjs runs every example through the real linter on the demo design
// system: the example must trip its rule and nothing else, and the fixed version (the rule's own
// fixes, or `good` where the change needs a decision) must come out clean. A new rule without an
// entry here fails the build.

export const ruleDocs = {
  'no-hardcoded-color': {
    why: 'A hex value is a copy of a token that stops following it: when the theme changes, or in dark mode, the copy stays behind. Agents write them whenever a prompt names a color ("a red alert", "a green label"), and in the benchmark they were most of what the agents got wrong.',
    allow:
      'Colors to accept anyway, as written in the class or the style: `["error", { "allow": ["#fff"] }]`.',
    bad: `<div className="rounded-md bg-gray-100 p-3 text-[#737373]">
  Only owners can delete a workspace.
</div>
`,
  },
  'no-hardcoded-spacing': {
    why: 'Off-scale padding and gaps make layouts drift a pixel at a time, and an arbitrary value hides which step was meant. When the value is on the scale, the fix is just its name. A warning by default, because a deliberate one-off is sometimes right.',
    allow:
      'Values to accept anyway, as the class or the length: `["warn", { "allow": ["px-[18px]"] }]`.',
    bad: `<div className="flex items-center gap-[6px] px-[18px] py-[13px]">
  <Badge>Beta</Badge>
</div>
`,
  },
  'no-hardcoded-radius': {
    why: 'Corners are part of the visual language. An arbitrary radius looks almost right next to the components and never quite matches them. A warning by default.',
    allow: 'Values to accept anyway, as the class or the length.',
    bad: `<div className="rounded-[7px] border p-4">
  <Badge className="rounded-[999px]">New</Badge>
</div>
`,
  },
  'prefer-design-system-component': {
    why: "A native `<button>` skips what the design system's `Button` carries: variants, focus styles, disabled states, and every fix the team made since. Agents write native elements with hand-rolled classes because that is what most code they learned from looks like.",
    allow: 'Native elements to accept anyway: `["error", { "allow": ["a"] }]`.',
    bad: `<form className="flex gap-2">
  <input type="email" placeholder="you@example.com" />
  <button className="rounded-md bg-primary px-3 text-sm text-primary-foreground">
    Invite
  </button>
</form>
`,
  },
  'no-unknown-component': {
    why: 'Agents mix up conventions between libraries: `<Card.Header>` where the system exports flat parts, or a component that only exists in another kit. TypeScript reports it once the file compiles in the project; `check_ui` reports it in a snippet the agent has not saved yet, and names the part to use.',
    bad: `<Card>
  <Card.Header>
    <Card.Title>Billing</Card.Title>
  </Card.Header>
</Card>
`,
  },
  'no-unknown-prop': {
    why: 'Props from other libraries (`tone`, `isDisabled`, `isOpen`) do nothing or break the build. The rule suggests the prop this system uses, with its allowed values, and explains how Radix (`asChild`) and Base UI (`render`) compose when an agent mixes them up.',
    bad: `<div className="grid gap-2">
  <Badge tone="success">Active</Badge>
  <Input isDisabled placeholder="Workspace name" />
</div>
`,
  },
  'no-unknown-variant': {
    why: '`variant="danger"` on a `Button` that only knows `destructive` renders without that variant\'s styles, so the mistake looks like a working button. The rule lists the allowed values and maps synonyms across libraries (`danger` → `destructive`, `small` → `sm`).',
    bad: `<Button variant="danger" size="small">
  Delete workspace
</Button>
`,
  },
  'icon-button-accessible-name': {
    why: 'A button with only an icon is announced as just "button" to screen-reader users. It is the most common accessibility slip in real apps: `check` found 11 in vercel/ai-chatbot and 105 in midday\'s dashboard. The fix guesses the label from the icon (`Trash2` → "Delete").',
    bad: `<Button variant="ghost" size="icon">
  <Trash2 />
</Button>
`,
  },
};
