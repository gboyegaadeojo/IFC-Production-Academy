"use client";

import { createContext, type ReactNode, useContext } from "react";
import { DEFAULT_BRANDING } from "@/lib/domain/branding";

export type BrandValue = { name: string; shortName: string; iconUrl: string | null };

const BrandContext = createContext<BrandValue>({ ...DEFAULT_BRANDING, iconUrl: null });

/** The app's name and logo for client components, read once in the root layout (ADD-DASH-04). */
export function BrandProvider({ value, children }: { value: BrandValue; children: ReactNode }) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandValue {
  return useContext(BrandContext);
}
