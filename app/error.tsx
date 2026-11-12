"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";
import { ErrorNotice, PRIMARY_ACTION, SECONDARY_ACTION } from "@/components/ErrorNotice";
import { useMessages } from "@/lib/i18n/locale";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useMessages();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorNotice title={t.errorPage.title} body={t.errorPage.body}>
      <button type="button" onClick={() => retry()} className={PRIMARY_ACTION}>
        {t.common.retry}
      </button>
      <Link href="/" className={SECONDARY_ACTION}>
        {t.header.home}
      </Link>
    </ErrorNotice>
  );
}
