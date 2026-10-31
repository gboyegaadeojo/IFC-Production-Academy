"use client";

import { Button } from "@/components/ui/button";

/** Prints the certificate, or saves it as a PDF from the browser's print dialog (SRS-CERT-004). */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
