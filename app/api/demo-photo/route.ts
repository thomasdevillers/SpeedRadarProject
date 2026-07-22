import { NextRequest } from "next/server";

export function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return new Response("Not found", { status: 404 });
  const variant = Number(request.nextUrl.searchParams.get("variant") ?? "1");
  const carX = variant === 2 ? 820 : variant === 3 ? 690 : 760;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#cad2d0"/><stop offset="1" stop-color="#73807d"/></linearGradient><linearGradient id="road" x2="0" y2="1"><stop stop-color="#4c5150"/><stop offset="1" stop-color="#151817"/></linearGradient><filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="2" seed="4" result="n"/><feBlend in="SourceGraphic" in2="n" mode="soft-light"/></filter></defs>
    <rect width="1600" height="520" fill="url(#sky)"/><path d="M0 510 L1600 440 L1600 900 L0 900Z" fill="url(#road)"/>
    <path d="M0 540 L1600 470" stroke="#d4d1b8" stroke-width="15" opacity=".65"/><path d="M0 760 L1600 640" stroke="#f6e289" stroke-width="8" stroke-dasharray="90 70" opacity=".85"/>
    <g transform="translate(${carX} 470) scale(1.35)" filter="url(#grain)"><path d="M60 170 L112 76 Q130 46 182 42 L376 42 Q430 44 462 88 L504 166 Q530 176 536 212 L536 274 L8 274 L8 214 Q16 180 60 170Z" fill="#252b2a"/><path d="M132 83 L190 68 L364 68 Q396 70 420 100 L444 146 L104 146Z" fill="#9cb4b7"/><rect x="202" y="198" width="154" height="48" rx="4" fill="#f4f0d7"/><text x="279" y="231" fill="#161918" font-family="monospace" font-size="27" text-anchor="middle">CA 482 719</text><circle cx="112" cy="270" r="50" fill="#101211" stroke="#606866" stroke-width="12"/><circle cx="432" cy="270" r="50" fill="#101211" stroke="#606866" stroke-width="12"/><rect x="34" y="172" width="84" height="30" fill="#f5e9b6"/><rect x="430" y="172" width="84" height="30" fill="#e54d2d"/></g>
    <rect x="26" y="24" width="246" height="42" fill="#111817" opacity=".88"/><text x="44" y="52" fill="#ff642f" font-family="monospace" font-size="19">RSR-0001 · LIVE FRAME</text>
  </svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
}
