import { NextResponse } from 'next/server';
import { getBlocks, getLivePredictions, buildBlockGeoJSON } from '@/lib/data';

export const revalidate = 60; // Cache for 60 seconds

export async function GET() {
  try {
    const [blocks, predictions] = await Promise.all([
      getBlocks(),
      getLivePredictions(),
    ]);

    const geojson = buildBlockGeoJSON(blocks, predictions);

    return NextResponse.json({
      success: true,
      blocksCount: blocks.length,
      predictionsCount: predictions.length,
      geojson,
      blocks,
    });
  } catch (error) {
    console.error('Error fetching block geojson:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve blocks' },
      { status: 500 }
    );
  }
}
