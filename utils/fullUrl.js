const getFullUrl = (req, relativePath) => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http')) return relativePath;
  
  // Use dynamic host if BASE_URL_TWO looks like a production URL and we are likely in development
  const envBaseUrl = process.env.BASE_URL_TWO;
  const host = req.get('host');
  const isProductionUrl = envBaseUrl && (envBaseUrl.includes('onrender.com') || envBaseUrl.includes('albayyan.com'));
  const isLocalHost = host.includes('localhost') || 
                     host.includes('127.0.0.1') || 
                     host.startsWith('192.168.') || 
                     host.startsWith('10.') || 
                     host.startsWith('172.');
  
  const baseUrl = (isProductionUrl && !isLocalHost) ? envBaseUrl : `${req.protocol}://${host}/`;

  // Ensure the relative path is prefixed with uploads/ if it's not already
  const normalizedPath = relativePath.startsWith('uploads/') ? relativePath : `uploads/${relativePath}`;
  
  // Ensure baseUrl ends with / and normalizedPath doesn't start with /
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;
  
  return `${cleanBaseUrl}${cleanPath}`;
};

module.exports = getFullUrl;
