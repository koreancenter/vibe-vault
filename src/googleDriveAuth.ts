import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

/**
 * Least-privilege Google Workspace OAuth scopes.
 * Only accesses this app's isolated hidden appDataFolder — never reads personal Drive files.
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
] as const;

let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Strictly in-memory OAuth access token cache — NEVER persisted to localStorage or sessionStorage.
let cachedAccessToken: string | null = null;

function ensureFirebaseAuth(): { app: FirebaseApp; auth: Auth; provider: GoogleAuthProvider } {
  if (!firebaseAppInstance) {
    firebaseAppInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!firebaseAuthInstance) {
    firebaseAuthInstance = getAuth(firebaseAppInstance);
  }
  if (!googleProviderInstance) {
    const provider = new GoogleAuthProvider();
    for (const scope of SCOPES) {
      provider.addScope(scope);
    }
    googleProviderInstance = provider;
  }
  return {
    app: firebaseAppInstance,
    auth: firebaseAuthInstance,
    provider: googleProviderInstance,
  };
}

export interface DriveAuthUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function toDriveAuthUserInfo(user: User | null): DriveAuthUserInfo | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/**
 * Initializes the Firebase Auth state listener and clears the in-memory OAuth token on sign-out.
 */
export function initDriveAuth(
  onAuthSuccess?: (user: DriveAuthUserInfo, token: string) => void,
  onAuthFailure?: (signedInUserWithoutToken?: DriveAuthUserInfo | null) => void
): () => void {
  const { auth } = ensureFirebaseAuth();
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(toDriveAuthUserInfo(user)!, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(toDriveAuthUserInfo(user));
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
}

/**
 * Triggers interactive Google Sign-In popup and obtains a fresh Drive appDataFolder OAuth access token.
 * Must be invoked directly from a user interaction (click handler).
 */
export async function googleDriveSignIn(): Promise<{
  user: DriveAuthUserInfo;
  accessToken: string;
}> {
  const { auth, provider } = ensureFirebaseAuth();
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive access token from authentication.');
    }
    cachedAccessToken = credential.accessToken;
    return {
      user: toDriveAuthUserInfo(result.user)!,
      accessToken: cachedAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export function getDriveAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedAccessToken = null;
}

export function getCurrentDriveUser(): DriveAuthUserInfo | null {
  if (!firebaseAuthInstance) return null;
  return toDriveAuthUserInfo(firebaseAuthInstance.currentUser);
}

export async function googleDriveSignOut(): Promise<void> {
  cachedAccessToken = null;
  if (!firebaseAuthInstance) return;
  await firebaseAuthInstance.signOut();
}
