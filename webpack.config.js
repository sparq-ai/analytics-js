const path = require("path");
const Dotenv = require('dotenv-webpack');

let baseCfg = {
  entry: "./src/StAnalyticsClient.ts",
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },
  devtool: "source-map",
  plugins: [new Dotenv({path:`./.env.${process.env.NODE_ENV}`})],
  module: {
    rules: [{
      test: /\.tsx?$/,
      loader: "ts-loader",
      exclude: /node_modules/,
      options: {
        compilerOptions: {
          declaration: false,
        }
      }
    }]
  },
  output: {
    path: path.resolve(__dirname, "lib"),
    filename: "index.min.js",
    libraryTarget: "umd",
    library: "StAnalyticsClient",
    umdNamedDefine: true,
    globalObject: "typeof self !== \"undefined\" ? self : this"
  }
};

module.exports = baseCfg;