export interface NoteListItem {
  path: string
  title: string
}

export interface NoteFile {
  path: string
  text: string
}

export interface NotesFace {
  loadNotes(): Promise<NoteListItem[]>
  readNote(path: string): Promise<NoteFile>
  writeNote(path: string, text: string): Promise<{ path: string }>
}
