/** Calm line for when pending requests could not be read, so it never looks like "none". */
export function RequestsUnavailable({ names = [] }: { names?: string[] }) {
  const who = names.length > 0 ? ` for ${names.join(" and ")}` : "";
  return (
    <p role="status" className="text-muted-foreground text-sm">
      We couldn't load requests{who} just now. Refresh to try again.
    </p>
  );
}
