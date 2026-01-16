import { NextRequest, NextResponse } from 'next/server';

interface WaitlistSubmission {
  email: string;
  name: string;
  company: string;
  company_size?: string;
  role?: string;
}

// Get backend URL from environment (HTTP, not WebSocket)
function getBackendUrl(): string {
  const wsUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:8080';
  // Convert ws:// to http:// or wss:// to https://
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

export async function POST(request: NextRequest) {
  try {
    const body: WaitlistSubmission = await request.json();

    // Validate required fields
    if (!body.email || !body.name || !body.company) {
      return NextResponse.json(
        { error: 'Email, name, and company are required fields' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Forward request to backend
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward client IP for logging
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || request.ip || '',
        'User-Agent': request.headers.get('user-agent') || '',
      },
      body: JSON.stringify({
        email: body.email,
        name: body.name,
        company: body.company,
        company_size: body.company_size || null,
        role: body.role || null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to submit waitlist form' },
        { status: response.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully added to waitlist. You will receive a confirmation email shortly.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Waitlist API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
