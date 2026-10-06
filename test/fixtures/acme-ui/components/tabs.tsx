// Fixture: compound component built with Object.assign.
interface TabsProps {
  defaultValue: string;
  children?: unknown;
}

function TabsRoot({ defaultValue }: TabsProps) {
  return <div data-value={defaultValue} />;
}

/** The row of tab triggers. */
function TabsList({ label }: { label?: string }) {
  return <div role="tablist" aria-label={label} />;
}

function TabsTrigger({ value }: { value: string }) {
  return <button role="tab" value={value} />;
}

/** Switches between related views. */
export const Tabs = Object.assign(TabsRoot, { List: TabsList, Trigger: TabsTrigger });
