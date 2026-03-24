import { cn, Icon } from '@citadel-app/ui';
import React, { useState, useEffect, useRef } from 'react';
import { useYouTubePlayer } from '../../context/YouTubePlayerContext';
import { useWebviewAudio } from '@citadel-app/ui';


import { useLocation, useNavigate } from 'react-router-dom';

export const FloatingYouTubePlayer = () => {
    const { activeVideo, isFloating, setFloating, close, placeholderRef, miniPlayerWidth, setMiniPlayerWidth } = useYouTubePlayer();
    const [webviewCallbackRef, webviewElement] = useWebviewAudio();
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const location = useLocation();
    const navigate = useNavigate();
    const isDragging = useRef(false);
    const isResizing = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const [opacity, setOpacity] = useState(0);

    const miniPlayerHeight = miniPlayerWidth;

    const onYouTubePage = location.pathname === '/youtube';

    // Transition Logic
    useEffect(() => {
        if (!activeVideo) {
            setOpacity(0);
            return;
        }

        if (onYouTubePage) {
            setFloating(false);
            setOpacity(1);
            return undefined;
        } else {
            // Only show floating player if audio is playing or was already floating
            const checkAudibility = () => {
                if (webviewElement && webviewElement.isCurrentlyAudible) {
                    try {
                        if (webviewElement.isCurrentlyAudible()) {
                            setFloating(true);
                            setOpacity(1);
                        } else if (!isFloating) {
                            // If not audible and not floating, hide it
                            setOpacity(0);
                        }
                    } catch (e) {
                        // Element might be detached
                    }
                }
            };

            const interval = setInterval(checkAudibility, 1000);
            checkAudibility();
            return () => clearInterval(interval);
        }
    }, [onYouTubePage, activeVideo, webviewElement, isFloating, setFloating]);

    // Track placeholder position when on youtube page
    useEffect(() => {
        const updateRect = () => {
            if (onYouTubePage && placeholderRef.current) {
                const newRect = placeholderRef.current.getBoundingClientRect();
                setRect(newRect);
            }
        };

        const interval = setInterval(updateRect, 16); // Sync every frame-ish
        updateRect();
        return () => clearInterval(interval);
    }, [onYouTubePage, placeholderRef]);

    useEffect(() => {
        if (!webviewElement) return;
        const currentWebview = webviewElement;

        const handleDomReady = () => {
            currentWebview.insertCSS(`
                /* Hide regular video UI */
                ytd-masthead, 
                #masthead-container, 
                #secondary, 
                #comments, 
                #below, 
                ytd-engagement-panel-section-list-renderer,
                ytd-merch-shelf-renderer,
                #primary-inner > #meta,
                #primary-inner > #info,
                
                /* Hide Shorts UI */
                ytd-shorts [is-active] #navigation-endpoint,
                ytd-shorts #masthead-container,
                ytd-shorts ytd-reel-player-overlay-renderer,
                ytd-shorts #comments-button,
                ytd-shorts #like-button,
                ytd-shorts #dislike-button,
                ytd-shorts #share-button
                { display: none !important; }
                
                /* Make player full screen */
                #player-container-outer,
                #player-container-inner,
                ytd-watch-flexy[flexy] #primary.ytd-watch-flexy,
                #full-bleed-container {
                    padding: 0 !important;
                    margin: 0 !important;
                    max-width: none !important;
                    height: 100vh !important;
                }

                /* Shorts specific sizing */
                ytd-shorts, 
                ytd-shorts ytd-reel-video-renderer[is-active] {
                    height: 100vh !important;
                    width: 100vw !important;
                }
                
                /* Hide scrollbar */
                ::-webkit-scrollbar { display: none !important; }
            `);
        };

        currentWebview.addEventListener('dom-ready', handleDomReady);

        return () => {
            currentWebview.removeEventListener('dom-ready', handleDomReady);
        };
    }, [webviewElement]);

    if (!activeVideo) return null;

    const miniPlayerStyle: React.CSSProperties = isFloating ? {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: `${miniPlayerWidth}px`,
        height: `${miniPlayerHeight}px`,
        zIndex: 9999,
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: (isDragging.current || isResizing.current) ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: opacity,
        pointerEvents: opacity > 0 ? 'auto' : 'none'} : {
        position: 'fixed',
        top: rect?.top ?? 0,
        left: rect?.left ?? 0,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        zIndex: 9999,
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: opacity,
        pointerEvents: onYouTubePage ? 'auto' : 'none'};

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isFloating) return;
        isDragging.current = true;
        dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.current) {
            setPosition({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        } else if (isResizing.current) {
            const rightEdge = window.innerWidth - 24 + position.x;
            const newWidth = Math.max(200, Math.min(window.innerWidth - 48, rightEdge - e.clientX));
            setMiniPlayerWidth(newWidth);
        }
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            style={miniPlayerStyle}
            className={cn(
                "overflow-hidden bg-black shadow-2xl flex flex-col",
                isFloating ? "rounded-2xl border border-border" : "rounded-none"
            )}
        >
            {isFloating && (
                <>
                    <div
                        className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-[10001] flex items-center justify-center group/resize"
                        onMouseDown={handleResizeStart}
                    >
                        <div className="w-1.5 h-1.5 bg-white/20 rounded-full group-hover/resize:scale-150 group-hover/resize:bg-primary transition-all shadow-glow" />
                    </div>
                    <div
                        className="h-9 bg-zinc-900/90 backdrop-blur flex items-center justify-between px-3 shrink-0 cursor-move select-none border-b border-white/5"
                        onMouseDown={handleMouseDown}
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <Icon name="Youtube" size={12} className="text-red-500 shrink-0" />
                            <span className="text-[10px] font-black text-white/70 truncate uppercase tracking-widest italic">
                                {activeVideo.title}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => navigate('/youtube')}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
                                title="Expand"
                            >
                                <Icon name="Maximize" size={12} />
                            </button>
                            <button
                                onClick={close}
                                className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-white/50 hover:text-red-500"
                                title="Close"
                            >
                                <Icon name="X" size={12} />
                            </button>
                        </div>
                    </div>
                </>
            )}
            <div className="flex-1 relative bg-black pointer-events-none">
                <webview
                    ref={webviewCallbackRef}
                    src={activeVideo.link}
                    className="w-full h-full pointer-events-auto"
                    // @ts-ignore
                    useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    // @ts-ignore
                    allowpopups="true"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
            </div>
        </div>
    );
};
