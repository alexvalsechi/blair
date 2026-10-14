type Props = { keys: string[] };

export function KeyHint({ keys }: Props) {
  return (
    <span className="key-hint" aria-hidden="true">
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  );
}
