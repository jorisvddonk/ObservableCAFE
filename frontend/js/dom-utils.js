export function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
}

export function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function autoResize(textarea) {
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    });
}

export function hideContextMenuOnClick(contextMenu) {
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
}

export function showContextMenu(e, contextMenu, chunkId, getChunkElement) {
    e.preventDefault();
    
    const chunkEl = getChunkElement(chunkId);
    if (chunkEl) {
        const isTrusted = chunkEl.classList.contains('trusted');
        const contextTrust = document.getElementById('context-trust');
        const contextUntrust = document.getElementById('context-untrust');
        if (contextTrust) contextTrust.style.display = isTrusted ? 'none' : 'block';
        if (contextUntrust) contextUntrust.style.display = isTrusted ? 'block' : 'none';
    }
    
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
}
