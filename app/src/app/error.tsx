"use client";

import { RecoveryPanel } from "@/components/recovery-panel";

export default function ApplicationError({ error, retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RecoveryPanel reference={error.digest} retry={retry} />;
}
