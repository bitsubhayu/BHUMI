import { NextResponse } from 'next/server';
import { getModelMetadata } from '@/lib/data';

export const revalidate = 60;

export async function GET() {
  try {
    const metadata = await getModelMetadata();
    return NextResponse.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error('Error fetching model readiness metadata:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve model readiness metadata' },
      { status: 500 }
    );
  }
}
