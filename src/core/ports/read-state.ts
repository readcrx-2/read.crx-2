export interface IReadState {
  url: string;
  last: number;
  read: number;
  received: number;
  offset?: number | null;
  date?: number | null;
}
