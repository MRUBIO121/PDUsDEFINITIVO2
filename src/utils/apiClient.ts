interface FetchOptions extends RequestInit {
  params?: Record<string, string | number>;
}

export async function apiClient(
  endpoint: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { params, ...fetchOptions } = options;

  let url = endpoint;
  if (params) {
    const queryString = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString();
    url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
  }

  const defaultOptions: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  };

  if (fetchOptions.body && fetchOptions.body instanceof FormData) {
    delete (defaultOptions.headers as Record<string, string>)['Content-Type'];
  }

  return fetch(url, { ...defaultOptions, ...fetchOptions });
}

export async function apiGet(endpoint: string, params?: Record<string, string | number>): Promise<Response> {
  return apiClient(endpoint, {
    method: 'GET',
    params,
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });
}

export async function apiPost(endpoint: string, data?: any): Promise<Response> {
  return apiClient(endpoint, {
    method: 'POST',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
}

export async function apiPut(endpoint: string, data?: any): Promise<Response> {
  return apiClient(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiDelete(endpoint: string): Promise<Response> {
  return apiClient(endpoint, {
    method: 'DELETE',
  });
}
