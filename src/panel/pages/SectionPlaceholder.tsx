export function SectionPlaceholder(props: { title: string }) {
  return (
    <section class="dt-section">
      <h1>{props.title}</h1>
      <p class="dt-muted">This screen is designed next.</p>
    </section>
  );
}
