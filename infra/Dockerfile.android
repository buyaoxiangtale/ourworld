FROM eclipse-temurin:17-jdk-jammy
ARG ANDROID_COMMANDLINE_TOOLS=13114758
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${PATH}:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools"
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip && rm -rf /var/lib/apt/lists/*
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && curl --fail --location --retry 3 https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_COMMANDLINE_TOOLS}_latest.zip -o /tmp/android.zip && unzip -q /tmp/android.zip -d ${ANDROID_HOME}/cmdline-tools && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && rm /tmp/android.zip
RUN yes | sdkmanager --licenses >/dev/null && sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
WORKDIR /workspace
