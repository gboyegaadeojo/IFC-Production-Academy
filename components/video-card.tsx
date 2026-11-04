import type { CSSProperties } from "react";
import Link from "next/link";
import { departmentHueVar } from "@/lib/domain/departments";
import type { LibraryVideo } from "@/lib/domain/videos";

/** A lesson's video in a list (SRS-CUR-019). Wide, because videos are; its title shows if there's no still. */
export function VideoCard({ video }: { video: LibraryVideo }) {
  const style = { "--dept": departmentHueVar(video.category.hue) } as CSSProperties;
  return (
    <Link
      href={video.href}
      prefetch={false}
      style={style}
      className="group flex flex-col gap-1 rounded-card"
    >
      <span className="relative mb-1 block aspect-video overflow-hidden rounded-card border border-[color-mix(in_srgb,var(--dept)_35%,var(--border))] transition-[translate,box-shadow] duration-[var(--duration-base)] ease-standard group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-lift)] group-focus-visible:-translate-y-1 motion-reduce:translate-y-0!">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-full items-center justify-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--dept)_34%,var(--surface)),color-mix(in_srgb,var(--dept)_8%,var(--surface)))] p-3.5 text-center text-heading font-bold text-balance text-text"
          >
            {video.title}
          </span>
        )}
        {video.minutes ? (
          <span className="tabular absolute right-2 bottom-2 rounded-sm bg-text px-1.5 text-small font-medium text-bg">
            {video.minutes} min
          </span>
        ) : null}
      </span>
      <span className="font-semibold text-text">{video.title}</span>
      <span className="text-small text-text-muted">
        {video.courseTitle}
        {video.level === null ? "" : ` · Level ${video.level}`}
      </span>
    </Link>
  );
}
