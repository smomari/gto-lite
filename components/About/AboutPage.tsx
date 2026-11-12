"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { LanguageToggle } from "@/components/Settings/LanguageToggle";
import { aboutContent } from "@/lib/i18n/aboutContent";
import { useLocale } from "@/lib/i18n/locale";
import { FEEDBACK_URL } from "@/lib/siteUrl";

const LIST = "flex flex-col gap-1.5 pl-5 text-base text-ink-muted";

/** What the tool does, how its numbers are made and where they fall short, in the language chosen in the header. */
export function AboutPage() {
  const content = aboutContent(useLocale());
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-3 pb-16">
      <AppHeader homeLink>
        <LanguageToggle />
      </AppHeader>

      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{content.title}</h1>
        <p className="text-base text-ink">{content.lead}</p>
        <div>
          <Link href="/" className="inline-block rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11">
            {content.openSolver}
          </Link>
        </div>
      </div>

      {content.sections.map((section) => (
        <section key={section.id} id={section.id} className="flex scroll-mt-4 flex-col gap-2">
          <h2 className="text-base font-semibold text-ink">{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-base text-ink-muted">
              {paragraph}
            </p>
          ))}
          {section.items &&
            (section.ordered ? (
              <ol className={`${LIST} list-decimal`}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            ) : (
              <ul className={`${LIST} list-disc`}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ))}
          {section.id === "feedback" && (
            <p>
              <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="text-base text-accent underline-offset-2 hover:underline">
                {content.feedbackLink}
              </a>
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
