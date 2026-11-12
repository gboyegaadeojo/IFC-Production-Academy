/** What a private link shows once it has stopped working, or was never right (ADD-COPY-04, -05). */
export function LinkStopped() {
  return (
    <section role="status" className="rounded-card border border-border bg-surface p-6">
      <h1 className="text-title font-semibold">This link isn&apos;t working</h1>
      <p className="mt-2 text-text-secondary">
        It may have expired, the request may already be decided, or you may no longer be on the
        list. Use the link in your latest email, or ask the production team.
      </p>
    </section>
  );
}
