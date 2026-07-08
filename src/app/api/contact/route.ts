import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/contact
// Body: { firstName, lastName, email, phone, subject, message }
// Creates a Contact row (upserted by email) and a Messages row linked to it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = (body.firstName || '').toString().trim();
    const lastName = (body.lastName || '').toString().trim();
    const email = (body.email || '').toString().trim().toLowerCase();
    const phone = (body.phone || '').toString().trim();
    const subject = (body.subject || '').toString().trim();
    const message = (body.message || '').toString().trim();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'First name and last name are required.' },
        { status: 400 }
      );
    }
    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Please provide either an email address or a phone number.' },
        { status: 400 }
      );
    }
    if (!subject || !message) {
      return NextResponse.json(
        { error: 'Subject and message are required.' },
        { status: 400 }
      );
    }

    // Upsert Contact by email (or by phone if no email)
    let contact: any = null;
    try {
      if (email) {
        contact = await db.contact.upsert({
          where: { email },
          update: {
            firstName,
            lastName,
            mobile: phone || undefined,
          },
          create: {
            firstName,
            lastName,
            email,
            mobile: phone || undefined,
            subscribed: true,
          },
        });
      } else {
        contact = await db.contact.create({
          data: {
            firstName,
            lastName,
            email: email || null,
            mobile: phone || null,
            subscribed: true,
          },
        });
      }
    } catch (e) {
      // If unique constraint collision on phone etc., fall back to create
      contact = await db.contact.create({
        data: {
          firstName,
          lastName,
          email: email || null,
          mobile: phone || null,
          subscribed: true,
        },
      });
    }

    // Always create a Messages row (this is the actual enquiry)
    const msg = await db.messages.create({
      data: {
        contactId: contact?.id || null,
        firstName,
        lastName,
        email: email || null,
        mobile: phone || null,
        subject,
        message,
        isRead: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Your message has been received. Our team will respond within 24 hours.',
      contactId: contact?.id || null,
      messageId: msg.id,
    });
  } catch (e: any) {
    console.error('Contact API error:', e);
    return NextResponse.json(
      { error: 'Could not submit your message. Please try again later.' },
      { status: 500 }
    );
  }
}
