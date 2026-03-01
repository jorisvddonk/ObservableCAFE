export function getToken() {
    if (window.RXCAFE_TOKEN) {
        return window.RXCAFE_TOKEN;
    }
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token');
}

export function apiUrl(path, token) {
    const url = new URL(path, window.location.origin);
    if (token) {
        url.searchParams.set('token', token);
    }
    return url.toString();
}
