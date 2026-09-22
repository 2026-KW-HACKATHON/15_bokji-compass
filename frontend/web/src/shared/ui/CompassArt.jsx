export default function CompassArt() {
  return (
    <svg className="compass-art" viewBox="0 0 370 260" fill="none" aria-hidden="true">
      <path
        d="M32 231C2 181 79 143 115 179S197 247 244 192S293 149 350 169"
        stroke="#34d399"
        strokeWidth="1.5"
        strokeDasharray="4 7"
      />
      <path d="M43 99 178 33l144 73-119 97z" fill="var(--theme-border)" />
      <path d="m43 99 9 54 150 89 1-39z" fill="var(--theme-mid)" />
      <path d="m203 203 119-97-9 57-111 79z" fill="#34d399" />
      <path d="m66 111 119-56 106 54-93 75z" fill="var(--theme-pale)" />
      <path
        d="m115 89 25 29-28 24m62-80 6 44 45 20-4 41m-147-51 77-7 42 52 69-29"
        stroke="var(--theme-border)"
        strokeWidth="6"
      />
      <ellipse cx="198" cy="130" rx="75" ry="59" fill="var(--theme-primary)" opacity=".2" />
      <path d="M265 109v19c0 32-32 57-72 57s-72-25-72-57v-19" fill="var(--theme-deep)" />
      <ellipse cx="193" cy="108" rx="72" ry="57" fill="var(--theme-primary)" />
      <ellipse cx="193" cy="105" rx="60" ry="47" fill="#ffffff" stroke="var(--theme-mid)" strokeWidth="4" />
      <ellipse cx="193" cy="105" rx="48" ry="37" stroke="var(--theme-border)" />
      <path
        d="m153 75 6 5m67-5-6 5m-69 54 7-4m67 4-6-5m-26-66v8m0 70v8m-55-43h10m90 0h10"
        stroke="var(--theme-primary)"
        strokeWidth="2"
      />
      <path d="m211 78-6 34-32 24 8-34z" fill="var(--theme-mid)" />
      <path d="m211 78-6 34-24-10z" fill="var(--theme-primary)" />
      <circle cx="193" cy="106" r="5" fill="#f59e0b" />
      <path d="M88 47c0-10 8-18 18-18s18 8 18 18-18 29-18 29-18-19-18-29" fill="#f59e0b" />
      <circle cx="106" cy="47" r="6" fill="#fffbeb" />
      <path d="m288 62 4-10 4 10 10 4-10 4-4 10-4-10-10-4z" fill="#10b981" />
      <circle cx="303" cy="197" r="5" fill="#f59e0b" />
      <circle cx="59" cy="189" r="3" fill="var(--theme-focus)" />
    </svg>
  );
}
