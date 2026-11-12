import type { Metadata } from "next";
import { AboutPage } from "@/components/About/AboutPage";

export const metadata: Metadata = {
  title: "About",
  description: "How gtoLite makes its preflop ranges and solves postflop, how accurate it is, and what it doesn't do.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return <AboutPage />;
}
