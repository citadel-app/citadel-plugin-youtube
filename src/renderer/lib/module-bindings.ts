export const RssModuleBindings = {
    linkResolver: null as ((feedId: string, itemId: string, targetContent: any) => void) | null,
    search: null as ((query: string) => Promise<any[]>) | null,
    
    setBindings(
        linkFn: (feedId: string, itemId: string, targetContent: any) => void,
        searchFn: (query: string) => Promise<any[]>
    ) {
        this.linkResolver = linkFn;
        this.search = searchFn;
    }
};
