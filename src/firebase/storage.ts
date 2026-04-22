import { ref, uploadBytes, getDownloadURL, FirebaseStorage, deleteObject } from 'firebase/storage';

export async function uploadFileToStorage(
  storage: FirebaseStorage,
  path: string,
  file: File
): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function deleteFileFromStorage(
  storage: FirebaseStorage,
  path: string
): Promise<void> {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}
