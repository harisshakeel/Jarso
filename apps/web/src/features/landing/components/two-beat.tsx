/** A two-beat headline (design.md §9): the second beat in muted ink, as the reference sites do. */
export function TwoBeat({ beats: [first, second] }: { beats: readonly [string, string] }) {
  return (
    <>
      {first} <span className="text-muted-foreground">{second}</span>
    </>
  );
}
