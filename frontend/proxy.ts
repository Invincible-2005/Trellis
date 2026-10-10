import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { apiError, gate } from '@/lib/middleware/gate';

// /api/uploadthing: UploadThing's servers call it back after an upload (signed with
// UPLOADTHING_TOKEN, no Clerk session). User uploads are gated in app/api/uploadthing/core.ts.
const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/uploadthing(.*)']);
const isUploadThingRoute = createRouteMatcher(['/api/uploadthing(.*)']);
const isOrgSelectionRoute = createRouteMatcher(['/org-selection(.*)']);
const isApiRoute = createRouteMatcher(['/api(.*)']);

export default clerkMiddleware(async (auth, req) => {
  // UploadThing's callback is a server, which the bot check would block.
  if (isUploadThingRoute(req)) return;

  const { userId, orgId, redirectToSignIn } = await auth();

  // 1. Arcjet front gate for every request: attacks, bots, and the read limit (trellis/12 D27)
  const blocked = await gate(req, userId);
  if (blocked) return blocked;

  if (isPublicRoute(req)) return;

  // 2. Unauthenticated users
  if (!userId) {
    if (isApiRoute(req)) {
      return apiError(401, 'invalid_token', 'You are not signed in.');
    }
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // 3. Signed-in users without an active organization
  if (!orgId && !isOrgSelectionRoute(req)) {
    if (isApiRoute(req)) {
      return apiError(400, 'no_active_org', 'Select or create an organization first.');
    }
    const url = new URL('/org-selection', req.url);
    url.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/__clerk/:path*',
    '/(api|trpc)(.*)',
  ],
};
