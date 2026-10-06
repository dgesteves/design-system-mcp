// Fixture: static member assignment (Card.Header) plus a flat part (CardFooter).
interface CardProps {
  /** Adds a shadow. */
  elevated?: boolean;
  children?: unknown;
}

/** Groups related content. */
export function Card({ elevated = false }: CardProps) {
  return <section data-elevated={elevated} />;
}

function CardHeader({ title }: { title: string }) {
  return <header>{title}</header>;
}

Card.Header = CardHeader;

/** Actions at the bottom of a card. */
export function CardFooter({ align = "end" }: { align?: "start" | "end" }) {
  return <footer data-align={align} />;
}
