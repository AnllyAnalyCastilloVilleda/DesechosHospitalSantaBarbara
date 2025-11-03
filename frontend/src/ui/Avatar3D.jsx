import React from "react";

/** Trio de basureros sin tapa, con basura animada visible y temática por color */
export default function Avatar3D({ size = 260, title = "Basureros de reciclaje" }) {
  return (
    <div
      className="avatar-bin-trio"
      style={{
        width: size,
        height: size * 0.62,
        display: "block",
        margin: "0 auto 10px",
      }}
      aria-hidden="true"
      title={title}
    >
      {/* viewBox alto para que nada se recorte */}
      <svg viewBox="0 0 420 260" width="100%" height="100%" role="img" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="redBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff6b6b" /><stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
          <linearGradient id="greenBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="blueBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity=".22" />
          </filter>
        </defs>

        {/* sombra de suelo */}
        <ellipse cx="210" cy="225" rx="150" ry="12" fill="rgba(0,0,0,.12)" />

        {/* Botes un poco más ABAJO para ganar margen superior */}
        <g transform="translate(110,60) scale(1.10)" className="bin bin-red"  filter="url(#soft)">
          {bin("redBody",  -0.10, "red")}
        </g>
        <g transform="translate(210,50) scale(1.28)" className="bin bin-green" filter="url(#soft)">
          {bin("greenBody", 0, "green")}
        </g>
        <g transform="translate(310,60) scale(1.10)" className="bin bin-blue" filter="url(#soft)">
          {bin("blueBody",  0.10, "blue")}
        </g>

        <style>{`
          .bin .float { animation: float 6s ease-in-out infinite; }
          .bin .eyes  { animation: blink 4.5s infinite; transform-origin: 50% 50%; }
          .trashA, .trashB { transform-origin: 0 0; }
          .bin-red  .float { animation-delay: 0s; }
          .bin-green.float, .bin-green .float { animation-delay: .18s; }
          .bin-blue .float { animation-delay: .36s; }

          /* Amplitud menor: más cerca del bote y no toca el borde superior */
          @keyframes bob1 { 0%,100% { transform: translateY(-10px) rotate(-8deg) } 50% { transform: translateY(-18px) rotate(10deg) } }
          @keyframes bob2 { 0%,100% { transform: translateY(-8px)  rotate(12deg) } 50% { transform: translateY(-16px) rotate(-12deg) } }

          .bin .trashA { animation: bob1 1.6s ease-in-out infinite; }
          .bin .trashB { animation: bob2 1.9s ease-in-out infinite; }

          @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
          @keyframes blink { 0%,92%,100% { transform: scaleY(1) } 94%,98% { transform: scaleY(.1) } }

          .avatar-bin-trio:hover .float { animation-duration: 4.6s; }
          .avatar-bin-trio:hover .trashA, .avatar-bin-trio:hover .trashB { animation-duration: 1.3s; }

          @media (prefers-reduced-motion: reduce) {
            .float, .eyes, .trashA, .trashB { animation: none !important; }
          }
        `}</style>
      </svg>
    </div>
  );
}

/** Dibujo del basurero y basura temática por color:
 *  rojo = peligrosos (pila y aerosol)
 *  verde = orgánico (banana y hoja)
 *  azul  = reciclables secos (botella y lata)
 */
function bin(bodyId, phase = 0, kind = "green") {
  return (
    <g className="float" style={{ animationDelay: `${phase}s` }}>
      {/* Ruedas */}
      <circle cx="-22" cy="160" r="10" fill="#2c3e50" />
      <circle cx="22"  cy="160" r="10" fill="#2c3e50" />

      {/* Cuerpo sin tapa */}
      <path d="M -34 48 L 34 48 L 26 150 L -26 150 Z"
            fill={`url(#${bodyId})`} stroke="rgba(0,0,0,.08)" strokeWidth="1" />
      {/* Borde superior */}
      <rect x="-30" y="46" width="60" height="6" rx="3" fill="rgba(0,0,0,.18)" />
      <rect x="-28" y="47" width="56" height="4" rx="2" fill="rgba(255,255,255,.18)" />

      {/* Franja y asa */}
      <rect x="-26" y="80" width="52" height="10" rx="5" fill="rgba(255,255,255,.12)" />
      <rect x="-12" y="62" width="24" height="8" rx="4" fill="rgba(0,0,0,.14)" />

      {/* Carita grande */}
      <g>
        <g className="eyes">
          <circle cx="-13" cy="96" r="6.2" fill="#0f172a" />
          <circle cx="13"  cy="96" r="6.2" fill="#0f172a" />
        </g>
        <path d="M -10 112 q 10 10 20 0" stroke="#0b2240" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>

      {/* Basura visible — MÁS pegada al borde del bote (anclada en y=64) */}
      {kind === "red" && (
        <>
          {/* Pila */}
          <g className="trashA" style={{ animationDelay: `${phase+.05}s` }} transform="translate(0,64)">
            <rect x="-22" y="-8" width="14" height="26" rx="3" fill="#374151" stroke="#111827" strokeWidth="1.2"/>
            <rect x="-19" y="-11" width="8" height="6" rx="2" fill="#9ca3af" stroke="#6b7280" strokeWidth=".8"/>
            <path d="M-21 5 l10 0" stroke="#f59e0b" strokeWidth="2"/>
          </g>
          {/* Aerosol */}
          <g className="trashB" style={{ animationDelay: `${phase+.18}s` }} transform="translate(0,64)">
            <rect x="8" y="-10" width="12" height="28" rx="3" fill="#ef4444" stroke="#991b1b" strokeWidth="1.2"/>
            <rect x="9" y="-14" width="10" height="6" rx="2" fill="#9ca3af" />
            <circle cx="14" cy="3" r="3" fill="#ffffff" />
          </g>
        </>
      )}

      {kind === "green" && (
        <>
          {/* Banana */}
          <g className="trashA" style={{ animationDelay: `${phase+.05}s` }} transform="translate(0,64)">
            <path d="M -24 2 C -4 -10, 0 6, -16 16" fill="none" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
            <circle cx="-22" cy="1" r="1.8" fill="#92400e" />
          </g>
          {/* Hoja */}
          <g className="trashB" style={{ animationDelay: `${phase+.18}s` }} transform="translate(0,64)">
            <path d="M 10 -4 c 12 -6, 18 10, 4 16 c -10 4, -18 -6, -4 -16 z" fill="#22c55e" stroke="#16a34a" strokeWidth="1.2"/>
            <path d="M 10 -2 l 10 10" stroke="#065f46" strokeWidth="1"/>
          </g>
        </>
      )}

      {kind === "blue" && (
        <>
          {/* Botella */}
          <g className="trashA" style={{ animationDelay: `${phase+.05}s` }} transform="translate(0,64)">
            <rect x="10" y="-12" width="10" height="30" rx="4" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="1.2"/>
            <rect x="11.5" y="-16" width="7" height="6" rx="2" fill="#60a5fa" />
          </g>
          {/* Lata */}
          <g className="trashB" style={{ animationDelay: `${phase+.18}s` }} transform="translate(0,64)">
            <rect x="-22" y="-6" width="14" height="20" rx="3" fill="#d1d5db" stroke="#6b7280" strokeWidth="1.2"/>
            <rect x="-20" y="-10" width="10" height="6" rx="2" fill="#9ca3af" />
          </g>
        </>
      )}

      {/* Sticker pequeño */}
      <g transform="translate(0,136) scale(0.9)">
        <rect x="-10" y="-10" width="20" height="20" rx="4" fill="rgba(255,255,255,.65)"/>
        <path d="M-2 -6 l4 7 h-8z" fill="#16a34a" />
        <path d="M-6 0 l7 4 v-8z" fill="#16a34a" />
        <path d="M2 6 l-4 -7 h8z" fill="#16a34a" />
      </g>
    </g>
  );
}
