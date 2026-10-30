import qrcode from "qrcode-generator";

/**
 * A QR code drawn as one SVG path, dark modules on a white quiet zone so phones read it on a dark
 * page. Error correction M survives a little glare on a projector or a creased printout.
 */
export function QrCode({
  value,
  label,
  size = 240,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  const margin = 4;
  const total = count + margin * 2;

  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) {
        path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-button"
    >
      {/* A QR code needs real black on white; this is content, not a theme colour. */}
      <rect width={total} height={total} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
