"use client";

import dynamic from "next/dynamic";

const HomePage = dynamic(() => import("@/components/home-page"), { ssr: false });

export function PageClient() {
  return <HomePage />;
}
