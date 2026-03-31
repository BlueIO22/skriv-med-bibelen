declare module "react-howler" {
  import { Component } from "react";

  interface ReactHowlerProps {
    src: string | string[];
    playing?: boolean;
    loop?: boolean;
    mute?: boolean;
    volume?: number;
    onPlay?: () => void;
    onPause?: () => void;
    onEnd?: () => void;
    onLoad?: () => void;
    onLoadError?: (id: number, error: unknown) => void;
    onPlayError?: (id: number, error: unknown) => void;
    html5?: boolean;
    preload?: boolean;
    format?: string[];
  }

  export default class ReactHowler extends Component<ReactHowlerProps> {
    seek(pos?: number): number;
    duration(): number;
  }
}
