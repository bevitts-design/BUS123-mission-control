tell application "Google Chrome"
  set windowCount to count of windows
  repeat with windowIndex from 1 to windowCount
    set chromeWindow to item windowIndex of windows
    set tabCount to count of tabs of chromeWindow
    repeat with tabIndex from 1 to tabCount
      set chromeTab to item tabIndex of tabs of chromeWindow
      set candidateURL to URL of chromeTab
      if candidateURL starts with "http://localhost:8123/" or candidateURL starts with "http://127.0.0.1:8123/" then
        set active tab index of chromeWindow to tabIndex
        set index of chromeWindow to 1
        activate
        return "focused"
      end if
    end repeat
  end repeat
end tell

return "missing"
