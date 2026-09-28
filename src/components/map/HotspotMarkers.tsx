'use client';



interface HotspotMarkersProps {
  risks: Array<{ id: string; name: string; centroid: [number, number]; probability: number }>;
  onSelect: (id: string) => void;
  mapContainerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Renders up to 6 amber halo markers for the highest-risk blocks.
 * Uses DOM markers positioned via CSS (not MapLibre markers) for performance.
 */
export function HotspotMarkers({ risks, onSelect }: HotspotMarkersProps) {
  // Rendered as a visually-separate DOM overlay layer.
  // Actual positioning is done by the parent via StatChips/map.project.
  // Here we just render the visual element.
  const top6 = risks.slice(0, 6);

  return (
    <>
      {top6.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          aria-label={`Select ${r.name} — ${r.probability}% chance`}
          className="absolute pointer-events-auto"
          style={{ transform: 'translate(-50%, -50%)' }}
          type="button"
        >
          {/* Pulse ring */}
          <span
            className="absolute inset-0 rounded-full hotspot-ring"
            style={{
              background: '#F2A91F',
              opacity: 0.4,
            }}
          />
          {/* Solid dot */}
          <span
            className="relative block w-3 h-3 rounded-full"
            style={{ background: '#F2A91F', border: '2px solid white' }}
          />
        </button>
      ))}
    </>
  );
}
