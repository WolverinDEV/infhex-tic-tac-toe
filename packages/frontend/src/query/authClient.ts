import type { AccountResponse, RegisterCredentialsRequest } from '@ih3t/shared';

import { fetchJson, getApiBaseUrl } from './apiClient';

type CsrfResponse = {
    csrfToken: string
};

async function fetchCsrfToken() {
    const response = await fetch(`${getApiBaseUrl()}/auth/csrf`, {
        credentials: `include`,
    });

    if (!response.ok) {
        throw new Error(`Failed to start authentication.`);
    }

    const data = await response.json() as CsrfResponse;
    if (!data.csrfToken) {
        throw new Error(`Authentication token is missing.`);
    }

    return data.csrfToken;
}

type AuthRedirectResponse = {
    url?: string
};

function submitAuthForm(path: string, values: Record<string, string>) {
    const form = document.createElement(`form`);
    form.method = `POST`;
    form.action = `${getApiBaseUrl()}${path}`;
    form.style.display = `none`;

    for (const [key, value] of Object.entries(values)) {
        const input = document.createElement(`input`);
        input.type = `hidden`;
        input.name = key;
        input.value = value;
        form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
    form.remove();
}

async function postAuthForm(path: string, values: Record<string, string>) {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        method: `POST`,
        credentials: `include`,
        headers: {
            'Content-Type': `application/x-www-form-urlencoded`,
            'X-Auth-Return-Redirect': `1`,
        },
        body: new URLSearchParams(values),
    });

    const data = await response.json().catch((): AuthRedirectResponse => ({}));
    if (!response.ok) {
        throw new Error(`Authentication request failed.`);
    }

    return data;
}

export function getSignInErrorMessage(errorCode: string | null): string | null {
    switch (errorCode) {
        case `CredentialsSignin`:
            return `The username or password you entered is incorrect.`;
        case `AccessDenied`:
            return `Sign-in was denied.`;
        case `Configuration`:
            return `Authentication is not configured correctly on the server.`;
        case null:
            return null;
        default:
            return `Unable to sign in right now.`;
    }
}

export async function signInWithDiscord(callbackUrl = window.location.href) {
    const csrfToken = await fetchCsrfToken();
    submitAuthForm(`/auth/signin/discord`, {
        csrfToken,
        callbackUrl,
    });
}

export async function signInWithCredentials(credentials: RegisterCredentialsRequest, callbackUrl: string) {
    const csrfToken = await fetchCsrfToken();
    const response = await postAuthForm(`/auth/callback/credentials`, {
        csrfToken,
        username: credentials.username,
        password: credentials.password,
        callbackUrl,
    });
    const redirectUrl = typeof response.url === `string` ? response.url : callbackUrl;
    const errorCode = new URL(redirectUrl, window.location.origin).searchParams.get(`error`);

    return {
        redirectUrl,
        errorMessage: getSignInErrorMessage(errorCode),
    };
}

export async function registerCredentialsAccount(credentials: RegisterCredentialsRequest) {
    return await fetchJson<AccountResponse>(`/api/auth/register`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(credentials),
    });
}

export async function signOutAccount() {
    const csrfToken = await fetchCsrfToken();
    submitAuthForm(`/auth/signout`, {
        csrfToken,
        callbackUrl: window.location.href,
    });
}
