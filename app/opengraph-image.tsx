import { ImageResponse } from "next/og";
import { SharePreviewArt } from "@/lib/brandArt";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/siteUrl";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<SharePreviewArt />, size);
}
