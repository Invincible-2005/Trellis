// Typed UploadThing components for client components ('use client').
//
//   <UploadDropzone
//     endpoint="policyDocument"
//     onClientUploadComplete={([file]) => { /* file.serverData.url → createDocument */ }}
//     onUploadError={(err) => toast.error(err.message)}
//   />
import { generateUploadButton, generateUploadDropzone } from '@uploadthing/react';
import type { UploadRouter } from '@/app/api/uploadthing/core';

export const UploadButton = generateUploadButton<UploadRouter>();
export const UploadDropzone = generateUploadDropzone<UploadRouter>();
