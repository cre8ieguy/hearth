// Electron <webview> tag for TSX (enabled via webviewTag in the main process).
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          allowpopups?: string
          partition?: string
        },
        HTMLElement
      >
    }
  }
}
