import {NextRequest,NextResponse} from 'next/server';
// Overwrite incoming headers so direct links and APIs share a trusted route identity.
export function proxy(request:NextRequest){
 const headers=new Headers(request.headers);
 headers.set('x-rj-request-path',request.nextUrl.pathname);
 return NextResponse.next({request:{headers}});
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icons/|field-offline/).*)']};
