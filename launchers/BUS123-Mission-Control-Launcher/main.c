#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static const char *restart_script = "/Users/bethanyevittsair2/Documents/GitHub/BUS123-mission-control-active/scripts/restart-mission-control.zsh";
static const char *launcher_log_directory = "/Users/bethanyevittsair2/Library/Logs/BUS123 Mission Control";
static const char *launcher_log_path = "/Users/bethanyevittsair2/Library/Logs/BUS123 Mission Control/launcher.log";

static void append_launcher_log(const char *format, ...) {
  char timestamp[40] = {0};
  time_t now = time(NULL);
  struct tm local_time;

  mkdir("/Users/bethanyevittsair2/Library/Logs", 0755);
  mkdir(launcher_log_directory, 0755);

  if (localtime_r(&now, &local_time) != NULL) {
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%S%z", &local_time);
  } else {
    snprintf(timestamp, sizeof(timestamp), "unknown-time");
  }

  int log_descriptor = open(launcher_log_path, O_WRONLY | O_CREAT | O_APPEND, 0644);
  if (log_descriptor < 0) {
    return;
  }

  dprintf(log_descriptor, "%s ", timestamp);

  va_list arguments;
  va_start(arguments, format);
  vdprintf(log_descriptor, format, arguments);
  va_end(arguments);

  dprintf(log_descriptor, "\n");
  close(log_descriptor);
}

int main(void) {
  append_launcher_log("Native launcher invoked.");

  pid_t child = fork();
  if (child < 0) {
    append_launcher_log("Could not fork the maintained wrapper: %s", strerror(errno));
    return 78;
  }

  if (child == 0) {
    int null_descriptor = open("/dev/null", O_RDWR);
    if (null_descriptor >= 0) {
      dup2(null_descriptor, STDIN_FILENO);
      dup2(null_descriptor, STDOUT_FILENO);
      if (null_descriptor > STDERR_FILENO) {
        close(null_descriptor);
      }
    }

    int log_descriptor = open(launcher_log_path, O_WRONLY | O_CREAT | O_APPEND, 0644);
    if (log_descriptor >= 0) {
      dup2(log_descriptor, STDERR_FILENO);
      if (log_descriptor > STDERR_FILENO) {
        close(log_descriptor);
      }
    }

    execl("/bin/zsh", "/bin/zsh", restart_script, (char *)NULL);
    dprintf(STDERR_FILENO, "Could not execute the maintained wrapper: %s\n", strerror(errno));
    _exit(78);
  }

  int status = 0;
  while (waitpid(child, &status, 0) < 0) {
    if (errno != EINTR) {
      append_launcher_log("Could not wait for the maintained wrapper: %s", strerror(errno));
      return 75;
    }
  }

  if (WIFEXITED(status)) {
    int exit_status = WEXITSTATUS(status);
    append_launcher_log("Native launcher finished with status %d.", exit_status);
    return exit_status;
  }

  if (WIFSIGNALED(status)) {
    int signal_number = WTERMSIG(status);
    append_launcher_log("Native launcher wrapper ended from signal %d.", signal_number);
    return 128 + signal_number;
  }

  append_launcher_log("Native launcher wrapper ended without an exit status.");
  return 75;
}
