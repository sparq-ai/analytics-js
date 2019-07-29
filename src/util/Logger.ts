let logger: any = {};
if (process.env.NoDE_ENV === "production") {
  logger = {
    error: function (...params) {
    },
    log: function (...params) {
    },
    info: function (...params) {
    }
  }
} else {

  logger = console;

}

export = logger;