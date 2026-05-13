import { NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';

export async function GET() {
  try {
    const correctEmail = 'powerbankdanab@gmail.com';
    
    // Find all users and update them to the correct email for now
    const usersSnap = await db.collection('system_users').get();
    
    const batch = db.batch();
    usersSnap.docs.forEach(doc => {
      batch.update(doc.ref, { email: correctEmail });
    });
    
    await batch.commit();

    return NextResponse.json({
      message: `✅ All admin emails updated to ${correctEmail}`,
      nextSteps: 'Now go back to /login and try again. The OTP will go to your Gmail now!'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
