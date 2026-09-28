import { NextRequest, NextResponse } from 'next/server';
import { getLiveWeatherBufferRecent } from '@/lib/data';

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get('block_id');

  if (!blockId) {
    return NextResponse.json({ success: false, error: 'block_id query parameter is required' }, { status: 400 });
  }

  try {
    const records = await getLiveWeatherBufferRecent(blockId, 14);
    return NextResponse.json({
      success: true,
      block_id: blockId,
      records,
    });
  } catch (error) {
    console.error('Error querying live_weather_buffer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve weather buffer records' },
      { status: 500 }
    );
  }
}
