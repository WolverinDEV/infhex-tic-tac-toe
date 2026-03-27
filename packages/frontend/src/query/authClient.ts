import { getApiBaseUrl } from './apiClient';

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

export async function signInWithDiscord() {
    const csrfToken = await fetchCsrfToken();
    submitAuthForm(`/auth/signin/discord`, {
        csrfToken,
        callbackUrl: window.location.href,
    });
}

export async function signOutAccount() {
    const csrfToken = await fetchCsrfToken();
    submitAuthForm(`/auth/signout`, {
        csrfToken,
        callbackUrl: window.location.href,
    });
}
