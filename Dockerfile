FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["SandWebVideoEditor/SandWebVideoEditor.csproj", "SandWebVideoEditor/"]
COPY ["SandWebVideoEditor.Client/SandWebVideoEditor.Client.csproj", "SandWebVideoEditor.Client/"]
COPY ["SandWebVideoEditor.slnx", "./"]

RUN dotnet restore "SandWebVideoEditor/SandWebVideoEditor.csproj"

COPY . .
WORKDIR "/src/SandWebVideoEditor"
RUN dotnet publish "SandWebVideoEditor.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update \
       && apt-get install -y --no-install-recommends ffmpeg \
       && rm -rf /var/lib/apt/lists/*
WORKDIR /app
EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "SandWebVideoEditor.dll"]
