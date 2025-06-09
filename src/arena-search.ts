import { getArenaSearchResults } from './arena-api';

// Arena Search Page functionality
document.addEventListener('DOMContentLoaded', () => {
  setupArenaSearch();
});

function setupArenaSearch() {
  const urlInput = document.getElementById('arena-url-input') as HTMLInputElement;
  const authTokenInput = document.getElementById('arena-auth-token-input') as HTMLInputElement;
  const perPageInput = document.getElementById('arena-per-page-input') as HTMLSelectElement;
  const pageInput = document.getElementById('arena-page-input') as HTMLInputElement;
  const searchBtn = document.getElementById('arena-search-btn') as HTMLButtonElement;
  const loadingDiv = document.getElementById('arena-loading') as HTMLDivElement;
  const errorDiv = document.getElementById('arena-error') as HTMLDivElement;
  const resultsDiv = document.getElementById('arena-results') as HTMLDivElement;
  const summaryDiv = document.getElementById('arena-summary') as HTMLDivElement;
  const searchResultsDiv = document.getElementById('arena-search-results') as HTMLDivElement;
  const paginationDiv = document.getElementById('arena-pagination') as HTMLDivElement;
  
  // Auth token popup elements
  const authTokenBtn = document.getElementById('auth-token-btn') as HTMLButtonElement;
  const authTokenPopup = document.getElementById('auth-token-popup') as HTMLDivElement;
  const closeAuthPopup = document.getElementById('close-auth-popup') as HTMLButtonElement;
  const saveAuthToken = document.getElementById('save-auth-token') as HTMLButtonElement;
  const clearAuthToken = document.getElementById('clear-auth-token') as HTMLButtonElement;

  if (!urlInput || !searchBtn) return;

  // Load saved auth token from localStorage
  loadSavedTokens();

  // Set default URL
  urlInput.value = 'ciechanow.ski/gps';

  // Update auth button appearance based on token
  updateAuthButtonState();

  // Save auth token to localStorage when it changes
  authTokenInput.addEventListener('input', () => {
    saveToken('auth_token', authTokenInput.value);
    updateAuthButtonState();
  });

  // Auth token popup handlers
  authTokenBtn.addEventListener('click', () => {
    authTokenPopup.classList.remove('hidden');
    authTokenInput.focus();
  });

  closeAuthPopup.addEventListener('click', () => {
    authTokenPopup.classList.add('hidden');
  });

  authTokenPopup.addEventListener('click', (e) => {
    if (e.target === authTokenPopup) {
      authTokenPopup.classList.add('hidden');
    }
  });

  saveAuthToken.addEventListener('click', () => {
    saveToken('auth_token', authTokenInput.value);
    updateAuthButtonState();
    authTokenPopup.classList.add('hidden');
  });

  clearAuthToken.addEventListener('click', () => {
    authTokenInput.value = '';
    saveToken('auth_token', '');
    updateAuthButtonState();
    authTokenPopup.classList.add('hidden');
  });

  // Handle search
  searchBtn.addEventListener('click', () => performSearch());
  
  // Handle Enter key in URL input
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Handle Enter key in page input
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  function loadSavedTokens() {
    const savedAuthToken = localStorage.getItem('arena_auth_token');
    
    if (savedAuthToken) {
      authTokenInput.value = savedAuthToken;
    }
  }

  function updateAuthButtonState() {
    const hasAuthToken = authTokenInput.value.trim().length > 0;
    
    if (hasAuthToken) {
      authTokenBtn.textContent = '🔑 auth ✓';
      authTokenBtn.classList.add('text-green-600');
      authTokenBtn.classList.remove('text-stone-500');
    } else {
      authTokenBtn.textContent = '🔑 auth';
      authTokenBtn.classList.remove('text-green-600');
      authTokenBtn.classList.add('text-stone-500');
    }
  }

  function saveToken(key: string, value: string) {
    if (value.trim()) {
      localStorage.setItem(`arena_${key}`, value.trim());
    } else {
      localStorage.removeItem(`arena_${key}`);
    }
  }

  function showTokenInstructions() {
    authTokenPopup.classList.remove('hidden');
    authTokenInput.focus();
  }

  async function performSearch() {
    const urlInputVal = urlInput.value.trim();
    if (!urlInputVal) {
      showError('Please enter a URL to search for');
      return;
    }

    let url = urlInputVal;
    if (url.startsWith('https://')) {
      url = url.substring('https://'.length);
    } else if (url.startsWith('http://')) {
      url = url.substring('http://'.length);
    }

    // Remove www.
    if (url.startsWith('www.')) {
      url = url.substring('www.'.length);
    }

    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    showLoading(true);
    hideError();
    hideResults();

    const options: { 
      appToken: string; 
      authToken?: string; 
      page?: number; 
      per?: number; 
    } = {
      appToken: import.meta.env.VITE_ARENA_APP_TOKEN,
      page: parseInt(pageInput.value) || 1,
      per: parseInt(perPageInput.value) || 24
    };
    
    const authToken = authTokenInput.value.trim();
    if (authToken) {
      options.authToken = authToken;
    }

    try {
      const searchResults = await getArenaSearchResults(url, options);
      await showResults(url, searchResults, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        showError(`Rate limited! Add your auth token above to increase limits. Error: ${errorMessage}`);
        showTokenInstructions();
      } else {
        showError(`Error: ${errorMessage}`);
      }
    } finally {
      showLoading(false);
    }
  }

  function showLoading(show: boolean) {
    if (show) {
      loadingDiv.classList.remove('hidden');
      searchBtn.disabled = true;
      searchBtn.textContent = 'searching...';
      searchBtn.classList.add('opacity-50');
    } else {
      loadingDiv.classList.add('hidden');
      searchBtn.disabled = false;
      searchBtn.textContent = 'search';
      searchBtn.classList.remove('opacity-50');
    }
  }

  function showError(message: string) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    errorDiv.classList.add('fade-in');
  }

  function hideError() {
    errorDiv.classList.add('hidden');
  }

  function hideResults() {
    resultsDiv.classList.add('hidden');
  }

  async function showResults(url: string, searchResults: { total: number; results: any[] }, options: any) {
    // Show summary
    const currentPage = options.page || 1;
    const perPage = options.per || 24;
    const startIndex = (currentPage - 1) * perPage + 1;
    const endIndex = Math.min(startIndex + searchResults.results.length - 1, searchResults.total);
    
    // Group results by source URL for consolidation
    const groupedResults = groupResultsByUrl(searchResults.results);
    const totalGroups = Object.keys(groupedResults).length;
    
    summaryDiv.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-4 text-xs text-stone-600">
        <div class="flex items-center gap-4">
          <span class="font-medium text-stone-700">${searchResults.total.toLocaleString()} results</span>
          <span>showing ${startIndex}-${endIndex}</span>
          <span>page ${currentPage}</span>
          ${totalGroups !== searchResults.results.length ? `<span class="text-orange-600">• ${totalGroups} unique sources</span>` : ''}
        </div>
        <code class="bg-stone-100 px-2 py-1 rounded text-xs break-all font-mono">${url}</code>
      </div>
    `;

    // Show pagination
    showPagination(searchResults.total, currentPage, perPage);

    // Clear previous results
    searchResultsDiv.innerHTML = '';

    if (searchResults.results.length === 0) {
      searchResultsDiv.innerHTML = `
        <div class="col-span-full p-8 bg-white/60 rounded-2xl border border-stone-200/50 text-center text-stone-500">
          <div class="text-2xl mb-2">¯\\\\_(ツ)_/¯</div>
          <p class="text-sm">no results found</p>
        </div>
      `;
    } else {
      // Render grouped results
      Object.entries(groupedResults).forEach(([sourceUrlKey, results]) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'result-group bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-stone-200/50 hover:bg-white/90 transition-all';
        
        // Pass results directly, connections are now part of each result item
        const content = renderGroupedResult(sourceUrlKey, results);
        groupDiv.innerHTML = content;
        searchResultsDiv.appendChild(groupDiv);
      });
    }

    resultsDiv.classList.remove('hidden');
    resultsDiv.classList.add('fade-in');
  }

  function normalizeUrl(url: string): string {
    if (!url) return '';
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
      let pathname = urlObj.pathname;
      // Remove trailing slash if not the root path
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      // Consistent protocol, remove www, sort query params (optional, can be complex)
      return `${urlObj.hostname.replace(/^www\\./, '')}${pathname}`;
    } catch (e) {
      // Fallback for invalid URLs or non-HTTP URLs
      let fallback = url;
      
      // Attempt to remove www. prefix
      // Check for http://www. or https://www. first
      if (fallback.toLowerCase().startsWith('http://www.')) {
        fallback = 'http://' + fallback.substring('http://www.'.length);
      } else if (fallback.toLowerCase().startsWith('https://www.')) {
        fallback = 'https://' + fallback.substring('https://www.'.length);
      } else if (fallback.toLowerCase().startsWith('www.')) { // Then check for just www.
        fallback = fallback.substring('www.'.length);
      }
      
      // Remove trailing slash
      if (fallback.endsWith('/')) {
        fallback = fallback.slice(0, -1);
      }
      return fallback;
    }
  }

  function groupResultsByUrl(results: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};
    
    results.forEach(result => {
      let key: string;
      
      if (result.__typename === 'Channel') {
        // Channels are their own group
        key = `channel:${result.id}`;
      } else {
        // Group blocks by their normalized source URL
        const rawUrl = result.source_url || result.source?.url;
        key = normalizeUrl(rawUrl) || `${result.__typename}:${result.id}`; // Fallback if no URL
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(result);
    });
    
    return groups;
  }

  function renderGroupedResult(sourceKey: string, results: any[], connectionsData?: Map<string, any>): string {
    const firstResult = results[0];
    const isChannel = firstResult.__typename === 'Channel';
    const isMultipleBlocksWithSameSource = results.length > 1 && !isChannel;
    
    if (isChannel) {
      // Render channel normally (no direct connections to display in this view)
      return `
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-xl text-sm font-medium">channel</span>
            ${firstResult.visibility_name ? `<span class="px-2 py-1 bg-stone-100 text-stone-600 rounded-lg text-xs">${firstResult.visibility_name.toLowerCase()}</span>` : ''}
          </div>
          
          <h3 class="font-bold text-stone-800 leading-tight text-lg">
            <a href="https://are.na/${firstResult.slug || `channel/${firstResult.id}`}" target="_blank" 
               class="text-stone-800 hover:text-orange-600 transition-colors">
              ${firstResult.title || 'untitled channel'}
            </a>
          </h3>
          
          ${firstResult.owner ? `
            <p class="text-sm text-stone-500">
              by ${firstResult.owner.name || 'unknown'}
            </p>
          ` : ''}
          
          <div class="flex items-center justify-between text-sm text-stone-400">
            ${firstResult.counts?.contents ? `<span>${firstResult.counts.contents} item${firstResult.counts.contents !== 1 ? 's' : ''}</span>` : '<span></span>'}
            <span>#${firstResult.id}</span>
          </div>
        </div>
      `;
    } else {
      // Render grouped blocks
      const sourceUrl = firstResult.source?.url || firstResult.source_url;
      const displayUrl = normalizeUrl(sourceUrl); // Use normalized URL for display consistency
      const blockTypes = [...new Set(results.map(r => r.__typename))];
      // Titles are less relevant now we group by URL, but keep for potential future use or if sourceUrl is missing
      const titles = results.filter(r => r.title).map(r => r.title);
      const uniqueTitles = [...new Set(titles)];

      // Consolidate all connections from all blocks in this group
      const allConnections: any[] = [];
      results.forEach(result => {
        if (result.connections && Array.isArray(result.connections)) {
          allConnections.push(...result.connections);
        }
      });
      
      return `
        <div class="space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              ${blockTypes.map(type => `
                <span class="px-3 py-1 ${getBlockTypeColor(type)} rounded-xl text-sm font-medium">
                  ${type.toLowerCase()}
                </span>
              `).join('')}
              ${isMultipleBlocksWithSameSource ? `<span class="px-3 py-1 bg-amber-100 text-amber-700 rounded-xl text-sm font-medium">${results.length} blocks</span>` : ''}
            </div>
          </div>
          
          ${displayUrl ? `
            <div>
              <h3 class="font-bold text-stone-800 leading-tight text-lg mb-2">
                <a href="${sourceUrl}" target="_blank" 
                   class="text-stone-800 hover:text-orange-600 transition-colors break-all hover:underline">
                  ${displayUrl.length > 60 ? displayUrl.substring(0, 60) + '...' : displayUrl}
                </a>
              </h3>
              ${displayUrl.length > 60 ? `<p class="text-xs text-stone-500 font-mono break-all">${sourceUrl}</p>` : ''}
            </div>
          ` : `
            <h3 class="font-bold text-stone-800 leading-tight text-lg">
              ${blockTypes.join(', ').toLowerCase()} blocks
            </h3>
          `}
          
          ${uniqueTitles.length > 0 && !displayUrl /* Only show titles if no source URL to group by */ ? `
            <div class="bg-stone-50 rounded-xl p-4 space-y-2">
              <p class="text-xs text-stone-500 font-medium uppercase tracking-wide">Content Preview</p>
              ${uniqueTitles.slice(0, 2).map(title => `
                <div class="text-sm text-stone-700 leading-relaxed font-medium">"${title}"</div>
              `).join('')}
              ${uniqueTitles.length > 2 ? `<div class="text-xs text-stone-400">... and ${uniqueTitles.length - 2} more variations</div>` : ''}
            </div>
          ` : ''}
          
          ${renderConnectionsForGroup(allConnections)}
          
          <div class="flex items-center justify-between pt-2 border-t border-stone-100">
            <div class="flex-1 mr-4">
              <div class="flex gap-2 flex-wrap max-w-full">
                ${results.slice(0, 12).map(result => {
                  if (result.__typename === 'Link' && result.href) {
                    const blockId = result.href.split('/').pop();
                    return `
                      <a href="https://are.na${result.href}" target="_blank"
                         class="text-xs text-stone-400 hover:text-orange-600 transition-colors font-mono whitespace-nowrap">
                        #${blockId}
                      </a>`;
                  }
                  return ''; // Skip if not a Link or no href
                }).join('')}
                ${results.length > 12 ? `<span class="text-xs text-stone-300 whitespace-nowrap">+${results.length - 12} more</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  function renderConnectionsMetadata(results: any[], connectionsData: Map<string, any>): string {
    const allConnections: any[] = [];
    
    // Collect all connections from all blocks in this group
    results.forEach(result => {
      const blockConnections = connectionsData.get(result.id);
      if (blockConnections) {
        // Add both own and public connections
        if (blockConnections.my_connections) {
          allConnections.push(...blockConnections.my_connections.map((conn: any) => ({ ...conn, isOwn: true })));
        }
        if (blockConnections.public_connections) {
          allConnections.push(...blockConnections.public_connections.map((conn: any) => ({ ...conn, isOwn: false })));
        }
      }
    });

    if (allConnections.length === 0) {
      return `
        <div class="bg-stone-50 rounded-xl p-3 mt-3">
          <p class="text-xs text-stone-500 font-medium uppercase tracking-wide mb-1">Connections</p>
          <p class="text-sm text-stone-400">No channels found</p>
        </div>
      `;
    }

    // Group connections by channel to avoid duplicates
    const channelMap = new Map();
    allConnections.forEach(conn => {
      const channelId = conn.channel.id;
      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, conn);
      }
    });

    const uniqueConnections = Array.from(channelMap.values());
    const maxToShow = 8;
    const connectionsToShow = uniqueConnections.slice(0, maxToShow);
    const remainingCount = uniqueConnections.length - maxToShow;

    return `
      <div class="bg-stone-50 rounded-xl p-3 mt-3">
        <p class="text-xs text-stone-500 font-medium uppercase tracking-wide mb-2">Connected to ${uniqueConnections.length} channel${uniqueConnections.length !== 1 ? 's' : ''}</p>
        <div class="space-y-2">
          ${connectionsToShow.map(conn => `
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <a href="https://are.na${conn.channel.href}" target="_blank" 
                   class="font-medium text-stone-700 hover:text-orange-600 transition-colors truncate">
                  ${conn.channel.title || 'untitled'}
                </a>
                <span class="text-xs px-2 py-0.5 rounded bg-stone-200 text-stone-600 flex-shrink-0">
                  ${conn.channel.visibility_name?.toLowerCase() || 'unknown'}
                </span>
              </div>
              <div class="flex items-center gap-2 text-xs text-stone-400 flex-shrink-0">
                ${conn.channel.counts?.contents ? `<span>${conn.channel.counts.contents}</span>` : ''}
                <span>${conn.created_at}</span>
              </div>
            </div>
          `).join('')}
          ${remainingCount > 0 ? `
            <div class="text-xs text-stone-400 pt-1 border-t border-stone-200">
              + ${remainingCount} more channel${remainingCount !== 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderConnectionsForGroup(connections: any[]): string {
    if (!connections || connections.length === 0) {
      return `
        <div class="bg-stone-50 rounded-xl p-3 mt-3">
          <p class="text-xs text-stone-500 font-medium uppercase tracking-wide mb-1">Connections</p>
          <p class="text-sm text-stone-400">No channels found for this link.</p>
        </div>
      `;
    }

    // Deduplicate connections by user + channel slug combination to show unique "saves"
    const uniqueConnectionsMap = new Map<string, any>();
    connections.forEach(conn => {
      if (conn.user && conn.channel) {
        const key = `${conn.user.slug}-${conn.channel.slug}`;
        if (!uniqueConnectionsMap.has(key)) {
          uniqueConnectionsMap.set(key, conn);
        }
      }
    });

    const uniqueConnections = Array.from(uniqueConnectionsMap.values());
    
    // Sort connections by date added (newest first)
    uniqueConnections.sort((a, b) => {
      const dateA = new Date(a.channel.added_to_at).getTime();
      const dateB = new Date(b.channel.added_to_at).getTime();
      return dateB - dateA;
    });

    const maxToShow = 10;
    const connectionsToShow = uniqueConnections.slice(0, maxToShow);
    const remainingCount = uniqueConnections.length - maxToShow;

    return `
      <div class="bg-stone-50 rounded-xl p-4 mt-3 space-y-3">
        <p class="text-xs text-stone-500 font-medium uppercase tracking-wide">
          Connected by ${uniqueConnections.length} user${uniqueConnections.length !== 1 ? 's' : ''} to ${uniqueConnections.length} channel${uniqueConnections.length !== 1 ? 's' : ''}
        </p>
        <div class="space-y-2">
          ${connectionsToShow.map(conn => `
            <div class="flex items-start justify-between text-sm gap-2">
              <div class="flex-1 min-w-0">
                <a href="https://are.na/channel/${conn.channel.slug}" target="_blank" 
                   class="font-medium text-stone-700 hover:text-orange-600 transition-colors">
                  ${conn.channel.title || 'untitled'}
                </a>
                <div class="text-xs text-stone-500">
                  <a href="https://are.na/${conn.user.slug}" target="_blank" class="hover:text-orange-500">${conn.user.name}</a>
                  • ${new Date(conn.channel.added_to_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              </div>
              <span class="text-xs px-2 py-0.5 rounded bg-stone-200 text-stone-600 flex-shrink-0 whitespace-nowrap">
                ${conn.channel.visibility_name?.toLowerCase() || 'public'} 
              </span>
            </div>
          `).join('')}
          ${remainingCount > 0 ? `
            <div class="text-xs text-stone-400 pt-2 border-t border-stone-200 mt-2">
              + ${remainingCount} more connection${remainingCount !== 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function showPagination(total: number, currentPage: number, perPage: number) {
    const totalPages = Math.ceil(total / perPage);
    
    if (totalPages <= 1) {
      paginationDiv.innerHTML = '';
      return;
    }

    let paginationHTML = '';
    
    // Previous button
    if (currentPage > 1) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${currentPage - 1})">
          ← prev
        </button>
      `;
    }
    
    // Page numbers (show current page and a few around it)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(1)">1</button>
      `;
      if (startPage > 2) {
        paginationHTML += '<span class="px-2 text-stone-400 text-xs">⋯</span>';
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === currentPage;
      paginationHTML += `
        <button class="pagination-btn ${isActive ? 'active' : ''}" 
                ${isActive ? 'disabled' : `onclick="changePage(${i})"`}>
          ${i}
        </button>
      `;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += '<span class="px-2 text-stone-400 text-xs">⋯</span>';
      }
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>
      `;
    }
    
    // Next button
    if (currentPage < totalPages) {
      paginationHTML += `
        <button class="pagination-btn" onclick="changePage(${currentPage + 1})">
          next →
        </button>
      `;
    }
    
    paginationDiv.innerHTML = paginationHTML;
  }

  // Make changePage function global for onclick handlers
  (window as any).changePage = (page: number) => {
    pageInput.value = page.toString();
    performSearch();
  };

  function getBlockTypeIcon(typeName: string): string {
    const icons: { [key: string]: string } = {
      'Text': '📝',
      'Image': '🖼️',
      'Link': '🔗',
      'Embed': '📺',
      'Attachment': '📎',
      'PendingBlock': '⏳',
      'Channel': '📁'
    };
    return icons[typeName] || '📄';
  }

  function getBlockTypeColor(typeName: string): string {
    const colors: { [key: string]: string } = {
      'Text': 'bg-green-100 text-green-700',
      'Image': 'bg-purple-100 text-purple-700',
      'Link': 'bg-blue-100 text-blue-700',
      'Embed': 'bg-orange-100 text-orange-700',
      'Attachment': 'bg-gray-100 text-gray-700',
      'PendingBlock': 'bg-yellow-100 text-yellow-700',
      'Channel': 'bg-blue-100 text-blue-700'
    };
    return colors[typeName] || 'bg-stone-100 text-stone-700';
  }
}
