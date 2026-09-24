"use client";

export default function GlobalError({ error, retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <html lang="en"><body style={{ fontFamily: "Segoe UI, sans-serif", margin: "3rem", lineHeight: 1.6 }}>
    <h1>Hackathon Facilitator could not start</h1>
    <p role="alert">Try again or contact the application owner. Do not reset existing data.</p>
    {error.digest && <p>Support reference: {error.digest}</p>}
    <button onClick={retry}>Try loading again</button>
  </body></html>;
}
